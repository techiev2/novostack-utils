import { format } from "mysql2"
import logger from "../helpers/logging.js"

function getTypeMap(type) {
  type = type.split('(')[0]
  if (type.startsWith('int') || type.startsWith('float') || type.endsWith('int')) return Number
  if (type.startsWith('time') || type.endsWith('time')) return Date
  if (type === 'json') return 'JSON'
  return String
} 
function convertInformationSchemaToSchema(row) {
  const { COLUMN_NAME: field, DATA_TYPE, COLUMN_KEY: key, CHARACTER_MAXIMUM_LENGTH: maxLength, COLUMN_DEFAULT: defaultValue } = row
  const isPK = key === 'PRI'
  const type_ = getTypeMap(DATA_TYPE)
  return [field, { maxLength, defaultValue, isPK, type: type_ === 'JSON' ? 'JSON' : type_.name }]
}
function cleanup(row, schema) {
  let nested = {}
  row = Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => {
        try { value = JSON.parse(value) } catch (err) {}
        if (schema[key]?.type === 'JSON') value = value || {}
        const [main, key_] = key.split('___')
        if (!key_) return [key, value]
        nested[main] = nested[main] || {}
        Object.assign(nested[main], {[key_]: value})
      }).filter(($) => !!$?.length)
  )
  Object.assign(row, nested)
  return row
}

const SKIP_ON_JOIN_FIELDS = new Set([
  'email', 'token', 'password'
])

export default class Table {
  tableName
  #db
  #schema
  _database
  constructor(database) { this.#db = database, this._database = database }
  get db() { !!this.#db }
  get schemaJSON() {
    return new Promise(async (resolve) => {
      const schema = await this.schema
      Object.entries(schema).map(([key, value]) => {
        if (value?.type === 'JSON') return
        try { schema[key].type = value?.type?.name } catch (err) {}
      })
      resolve(schema)
    })
  }
  get #dbName() { return this.#db?.config.connectionConfig.database }
  get name() { return (this.tableName || this.constructor.name).toLowerCase() }
  async #getColumns(dbName, tableName) {
    const query = format(
      `select * from information_schema.columns where table_schema = ? and table_name = ?`,
      [dbName, tableName]
    )
    const columns = await this.#db.query(query)
    return Object.fromEntries(columns.map(convertInformationSchemaToSchema))
  }
  async #getReferences() {
    const refQuery = format(`SELECT * FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc where rc.TABLE_NAME = ?`, [this.name])
    const references = {}
    const constraints = {}
    await Promise.all((await this.#db.query(refQuery)).map(async (constraint) => {
      const { CONSTRAINT_SCHEMA: fromDB, UNIQUE_CONSTRAINT_SCHEMA: toDB, REFERENCED_TABLE_NAME: toTable, CONSTRAINT_NAME: constraintName }  = constraint
      const query$ = format(`select * from INFORMATION_SCHEMA.INNODB_FOREIGN_COLS where ID = ?`, [`${fromDB}/${constraintName}`]);
      (await this.#db.query(query$))
      .map(({ FOR_COL_NAME: fromCol, REF_COL_NAME: toCol }) => {
        references[`${fromDB}:${this.name}:${fromCol}`] = `${toDB}:${toTable}:${toCol}`
        constraints[constraintName] = { from: { db: fromDB, table: this.name, column: fromCol }, to: { db: toDB, table: toTable, column: toCol }}
      })
    }))
    return { references, constraints }
  }
  get schema() {
    return new Promise(async (resolve) => {
      const [ fields, { references, constraints } ] = await Promise.all([
        this.#getColumns(this.#dbName, this.name), this.#getReferences()
      ])
      let pk
      const $schema = Object.fromEntries(
        Object.entries(fields)
          .map(([key, schema_]) => {
            if (schema_.isPK) pk = key
            const reference = references[`${this.#dbName}:${this.name}:${key}`]
            if (reference) {
              const [db, table, column] = reference.split(':')
              Object.assign(schema_, { reference: { db, table, column } })
            }
            return [key, schema_]
          })
      )
      $schema.pk = pk
      $schema.constraints = constraints
      this.#schema = $schema
      resolve(this.#schema)
    })
  }
  async find({ query, projection, limit } = {}) {
    limit = isNaN(+limit) || +limit < 1 || +limit > 10 ? 10 : +limit
    query = query || {}
    projection = projection || []
    const schema = await this.schema
    const { pk } = schema
    delete schema.pk
    delete schema.constraints
    let fieldsFromSchema = Object.keys(schema)
    const schemaJSON = await this.schemaJSON
    projection = projection.filter((field) => {
      if (field.indexOf('(') !== -1 || field.indexOf(' as ') !== -1) return true
      return fieldsFromSchema.indexOf(field) !== -1
    })
    let invalidSearch = []
      Object.keys(query)
        .map((field) => {
          if (!schema[field]) invalidSearch.push(field)
        })
    if (invalidSearch.length) {
      throw { message: 'Invalid search field', metadata: { fields: invalidSearch, schema: schemaJSON }}
    }
    let fields = projection.length ? projection : fieldsFromSchema
    fields = fields
      .map((key) =>{
        if (schema[key]?.type === 'Date') {
          return `UNIX_TIMESTAMP(${this.name}.${key}) as ${key}`
        }
        if (key.indexOf('(') !== -1 || key.indexOf(' as ') !== -1) {
          return key
        }
        return `${this.name}.${key} as ${key}`
      })
    const validKeys = []
    const validValues = []
    Object.entries(query || {})
      .map(([key, value]) => {
        if (fieldsFromSchema.join(',').indexOf(key) === -1) return false
        return [`${this.name}.${key}`, value]
      }).filter((row) => !!row)
      .map(([key, value]) => {
        validKeys.push(`${key} = ?`)
        try { value = JSON.parse(value) } catch (err) {  }
        validValues.push(value)
      })
    const joinList = await Promise.all(Object.entries(schema).filter(([_, structure]) => !!structure.reference).map(([key, { reference }]) => [key, reference]).map(async ([key, reference]) => {
      const $schema = await this.#getColumns(reference.db, reference.table)
      const keys = Object.keys($schema).filter((key) => !SKIP_ON_JOIN_FIELDS.has(key)).map((key_) => {
        // FIXME: The fields in referenced table columns are not coming through.
        if ($schema[key_].type !== 'Date') return `${reference.db}.${reference.table}.${key_} as ${key}___${key_}`
        return `UNIX_TIMESTAMP(${reference.db}.${reference.table}.${key_}) as ${key}___${key_}`
      })
      if (!projection.length) fields.push(...keys)
      return `join ${reference.db}.${reference.table} on ${this.#dbName}.${this.name}.${key} = ${reference.db}.${reference.table}.${reference.column}`
    }))
    const joins = joinList.join(' ').trim()
    const filter = validKeys.length ? ` where ${validKeys.join(' and ').trim()} ` : ''
    let $pk = Object.entries(schema).filter(([_, value]) => !!value.pk)[0]
    $pk = $pk ? $pk[0] : null
    const sort = pk ? ` order by ${this.name}.${pk} desc ` : $pk ? ` order by ${this.name}.${$pk} desc ` : ''
    fields = fields.length ? fields : ['*']
    const dbQuery = format(`select ${fields.join(', ').trim()} from ${this.name} ${joins} ${filter} ${sort} limit ${limit}`.replace(/\s{2,}/gmi, ' '), validValues)
    const rows = await this.#db.query(dbQuery)
    if (!rows.length) throw {
      message: `No ${this.name} found`,
      context: 'data'
    }
    return rows.map((row) => cleanup(row, schema))
  }
  async update({ query = {}, payload = {} }) {
    const schema = await this.schema
    const { pk } = schema
    if (pk && payload[pk]) throw {
      message: 'Primary key cannot be updated.',
      context: 'data'
    }
    const queryFilter = Object.entries(query)
    const update = Object.entries(payload)
    if (!queryFilter.length) throw {
      message: 'Bulk/blanket update clause not allowed.',
      context: 'client'
    }
    const validFilter = queryFilter.filter(([key]) => !!schema[key])
    if (!validFilter.length) throw {
      message: 'Invalid filter keys provided.',
      context: 'client'
    }
    const validUpdates = update.filter(([key]) => !!schema[key])
    if (!validUpdates) throw {
      message: 'No valid update fields provided.',
      context: 'client'
    }
    const filterKeys = []
    const filterValues = []
    validFilter.map(([key, value]) => {
      filterKeys.push(`${key} = ?`)
      try { value = JSON.parse(value) } catch { }
      filterValues.push(value)
    })
    let updateKeys = []
    let updateValues = []
    validUpdates.map(([key, value]) => {
      updateKeys.push(`${key} = ?`)
      try { value = JSON.parse(value) } catch { }
      if (schema[key].type === 'JSON') value = JSON.stringify(value)
      updateValues.push(value)
    })
    if (!updateKeys.length) throw {
      message: 'No valid data provided for update',
      context: 'client'
    }
    const dbQuery = format(`update ${this.name} set ${updateKeys.join(', ').trim()} where ${filterKeys.join(' and ').trim()}`, [...updateValues, ...filterValues])
    try {
      const { changedRows } = await this.#db.query(dbQuery)
      if (!changedRows) throw { message: 'No rows updated.', context: 'client' }
    } catch (error) {
      // TODO: Find a good way to surface this constraint condition.
      if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') throw {
        message: 'Invalid data received',
        metadata: {

        }
      }
      throw error
    }
    // FIXME: The query post update needs to accommodate updation based on non-PK fields in the query - Ref Issue #1
    // const newQuery = Object.fromEntries([...validFilter, ...validUpdates].filter((key) => !!schema[key]))
    return this.find({ query })
  }
  // FIXME: There is a jump in counter. Identify the RC for a fix.
  async insert(payload = {}) {
    const schema = await this.schema
    const validFields = Object.entries(payload).filter(([key]) => !!schema[key])
    if (!validFields.length) {
        throw {
        message: `No valid fields provided for creating ${this.name}`,
        context: 'client',
        metadata: {
          schema: await this.schemaJSON
        }
      }
    }
    const insertKeys = []
    const insertValues = []
    validFields.map(([key, value]) => ( insertKeys.push(key) && insertValues.push(value)))
    const dbQuery = format(`INSERT INTO ${this.name}(${insertKeys.join(', ').trim()}) VALUES(?)`, [insertValues])
    let id
    try {
      ({ insertId: id } = await this.#db.query(dbQuery))
    } catch (error) {
      let { message } = error
      let constraint
      if (message.indexOf('CONSTRAINT ') !== -1) {
        constraint = message.split('CONSTRAINT "')[1]
        constraint = constraint.split('"')[0]
      }
      if (constraint) {
        const { to, from } = schema.constraints[constraint]
        throw {
          message: `Invalid data for ${from.db}.${from.table}.${from.column} referencing ${to.db}.${to.table}.${to.column}`
        }
      }
      if (message.indexOf('Duplicate entry') !== -1) {
        message = message.split(' key ')[1].replace(/\'/gmi, "")
        const [_, key] = message.split(".")
        const value = payload[key]
        throw { message: "Duplicate value received.", metadata: { key, value } }
      }
      logger.error(`[DB-TABLE]`, error)
      throw new Error(`Unable to create ${this.name}`)
    }
    return this.find({ query: { id } })
  }
  async raw(query, args) {
    return this.#db.query(format(query, args))
  }
}

export function getRepositories(domains) {  return Object.fromEntries(domains.map(([domain, cls]) => [domain, new cls()]))
}