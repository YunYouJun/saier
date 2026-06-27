import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import consola from 'consola'

import prompt from './play-prompt.json'
import workflow from './play-workflow.json'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// for local ComfyUI
axios.defaults.baseURL = 'http://localhost:8188'

const targetDir = 'F:/ai/ComfyUI_windows_portable/ComfyUI/temp'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const inputPrompt = query.prompt as string

  Object.values(prompt).forEach((p) => {
    if (p.class_type === 'TranslateTextNode') {
      // @ts-expect-error text
      p.inputs.text = decodeURIComponent(inputPrompt)
    }
  })

  const body = {
    client_id: 'a30b839676da46a6bc49a3a13114efb5',
    prompt,
    extra_data: {
      extra_pnginfo: { workflow },
    },
  }

  // todo a nodejs lib?
  const res = await axios.post('/prompt', body)
  await sleep(1000)

  if (res.data) {
    const files = fs.readdirSync(targetDir, { withFileTypes: true })
    let latestFile: fs.Dirent | undefined
    let latestMtime = 0

    files.forEach((file) => {
      const stats = fs.statSync(path.resolve(file.parentPath, file.name))

      if (file.isFile() && stats.mtimeMs > latestMtime) {
        latestMtime = stats.mtimeMs
        latestFile = file
      }
    })

    if (!latestFile) {
      return {
        statusCode: 500,
        body: 'error',
      }
    }

    consola.info(res.data)

    const imageFilePath = path.resolve(latestFile.parentPath, latestFile.name)
    const imageFile = fs.readFileSync(imageFilePath)
    return imageFile

    // return {
    //   data: res.data,
    //   filename: latestFile?.name,
    //   path: latestFile?.path,
    // }
  }
  else {
    return {
      statusCode: 500,
      body: 'error',
    }
  }
})
