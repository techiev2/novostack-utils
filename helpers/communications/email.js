import { createTransport } from 'nodemailer'

let emailer

export const communicationChannels = {
  email: {
    send(mailOptions) {
      emailer.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email: ", error);
        } else {
          console.log("Email sent: ", info.response);
        }
      });
    }
  }
}

export async function createCommunicationChannels({ email: emailConfigs = {} } = {}) {
  if (!emailer) emailer = createTransport(emailConfigs)
}