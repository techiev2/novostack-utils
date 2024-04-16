import { readFile } from 'fs/promises';
import { resolve } from 'path';

export async function renderTemplate(templatePath, data) {
  const template = (await readFile(resolve(templatePath))).toString()
  const regex = /\{\{(.*?)\}\}/g;
  return template.replace(regex, (_, key) => {
    return data.hasOwnProperty(key) ? data[key] : "";
  });
}