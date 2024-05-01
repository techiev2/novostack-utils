import { readFile } from 'fs/promises';
import { resolve } from 'path';

export async function renderTemplate({ templatePath, data, contents }) {
  if (!contents && !templatePath) throw new Error(`Either a templatePath or loaded contents is needed for renderer.`)
  const template = contents ? contents : (await readFile(resolve(templatePath))).toString()
  const regex = /\{\{(.*?)\}\}/g;
  return template.replace(regex, (_, key) => {
    return data.hasOwnProperty(key) ? data[key] : "";
  });
}
