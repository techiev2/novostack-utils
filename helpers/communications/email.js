import { createTransport } from 'nodemailer'
import logger from '../logging.js'

let emailer

export const communicationChannels = {
  email: {
    async send(mailOptions) {
      return new Promise((resolve, reject) => {
        emailer.sendMail(mailOptions, (error, info = {}) => {
          const { accepted, messageId } = info
          if (!accepted?.length) {
            logger.error(`sendMail`, `No recipients could be mailed.`)
            return reject({ message: `No recipients could be mailed.` })
          }
          if (error) {
            logger.error(`sendMail`, error)
            return reject(error)
          }
          logger.log(`sendMail`, {accepted, messageId })
          return resolve({accepted, messageId })
        })
      })
    }
  }
}

export async function createCommunicationChannels({ email: emailConfigs = {} } = {}) {
  if (!emailer) emailer = createTransport(emailConfigs)
}
