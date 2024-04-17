import { createTransport } from 'nodemailer'
import logger from '../logging.js'

let emailer

export const communicationChannels = {
  email: {
    send(mailOptions) {
      emailer.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email: ", error);
        } else {
          logger.log("Email sent: ", info);
        }
      });
    }
  }
}

export async function createCommunicationChannels({ email: emailConfigs = {} } = {}) {
  if (!emailer) emailer = createTransport(emailConfigs)
}