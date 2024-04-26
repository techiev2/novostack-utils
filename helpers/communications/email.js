import { createTransport } from 'nodemailer'
import logger from '../logging.js'

let emailer

export const communicationChannels = {
  email: {
    send(mailOptions) {
      emailer.sendMail(mailOptions, (error, info = {}) => {
        const { accepted, messageId } = info
        if (!accepted?.length) return logger.error(`sendMail`, `No recipients could be mailed.`)
        if (error) return logger.error(`sendMail`, error)
        logger.log(`sendMail`, {accepted, messageId })
      })
    }
  }
}

export async function createCommunicationChannels({ email: emailConfigs = {} } = {}) {
  if (!emailer) emailer = createTransport(emailConfigs)
}