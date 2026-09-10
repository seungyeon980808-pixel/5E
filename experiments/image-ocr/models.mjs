import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const modelDirectory = path.join(experimentDirectory, ".models");

export const MODEL_PROFILES = Object.freeze({
  fast: Object.freeze({
    repository: "tesseract-ocr/tessdata_fast",
    revision: "87416418657359cb625c412a48b6e1d6d41c29bd",
    files: Object.freeze({
      kor: Object.freeze({ bytes: 1_677_415, sha256: "6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2" }),
      eng: Object.freeze({ bytes: 4_113_088, sha256: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2" }),
    }),
  }),
  best: Object.freeze({
    repository: "tesseract-ocr/tessdata_best",
    revision: "e12c65a915945e4c28e237a9b52bc4a8f39a0cec",
    files: Object.freeze({
      kor: Object.freeze({ bytes: 12_528_128, sha256: "f888d4038348a0c3d25151e7f452bda0d74ca275b18cab146798bcbb94084fff" }),
      eng: Object.freeze({ bytes: 15_400_601, sha256: "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba" }),
    }),
  }),
});

export const PADDLE_MODEL_PROFILE = Object.freeze({
  repository: "snowfluke/ppu-paddle-ocr-models",
  revision: "bf1d5edb0335d3262be7caf13f766ba274b4cadd",
  files: Object.freeze({
    detection: Object.freeze({
      path: "detection/PP-OCRv5_mobile_det_infer.ort",
      file: "detection.ort",
      bytes: 4_896_928,
      sha256: "30acfc4e21f2a23669d01a75aaeb92190f96874613108a0f7086bed264420abc",
    }),
    recognition: Object.freeze({
      path: "recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx",
      file: "recognition.onnx",
      bytes: 13_443_278,
      sha256: "ee0dfde503d787c91fd0455daae2eb85311b4b5bdcddf85a54d8c1e0adc157de",
    }),
    dictionary: Object.freeze({
      path: "recognition/multi/korean/v5/ppocrv5_korean_dict.txt",
      file: "dictionary.txt",
      bytes: 47_452,
      sha256: "a3792cbb41215a43e555e16ff4a7f7b18db5dd80cd058637098f0d872f2dd9d6",
    }),
  }),
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function modelPath(profile, language) {
  return path.join(modelDirectory, profile, `${language}.traineddata`);
}

export function modelUrl(profile, language) {
  const specification = MODEL_PROFILES[profile];
  if (!specification || !specification.files[language]) throw new RangeError(`Unknown OCR model: ${profile}/${language}`);
  return `https://raw.githubusercontent.com/${specification.repository}/${specification.revision}/${language}.traineddata`;
}

export function paddleModelPath(name) {
  const specification = PADDLE_MODEL_PROFILE.files[name];
  if (!specification) throw new RangeError(`Unknown Paddle OCR model component: ${name}`);
  return path.join(modelDirectory, "paddle-v5-korean", specification.file);
}

export function paddleModelUrl(name) {
  const specification = PADDLE_MODEL_PROFILE.files[name];
  if (!specification) throw new RangeError(`Unknown Paddle OCR model component: ${name}`);
  return `https://huggingface.co/${PADDLE_MODEL_PROFILE.repository}/resolve/${PADDLE_MODEL_PROFILE.revision}/${specification.path}`;
}

async function validModel(file, specification) {
  try {
    const bytes = await readFile(file);
    return bytes.byteLength === specification.bytes && sha256(bytes) === specification.sha256;
  } catch {
    return false;
  }
}

export async function preparePaddleModels({ offline = false } = {}) {
  const directory = path.join(modelDirectory, "paddle-v5-korean");
  await mkdir(directory, { recursive: true });
  const prepared = [];
  for (const [name, expected] of Object.entries(PADDLE_MODEL_PROFILE.files)) {
    const file = paddleModelPath(name);
    const url = paddleModelUrl(name);
    if (!await validModel(file, expected)) {
      if (offline) throw new Error(`Pinned Paddle model is missing or invalid: ${name}`);
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`Paddle model download failed (${response.status}): ${name}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
        throw new Error(`Downloaded Paddle model failed integrity validation: ${name}`);
      }
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, file).catch(async error => {
        await rm(temporary, { force: true });
        throw error;
      });
    }
    prepared.push({ name, file, url, bytes: expected.bytes, sha256: expected.sha256 });
  }
  return prepared;
}

export async function prepareModels(profiles, { offline = false } = {}) {
  const prepared = [];
  for (const profile of profiles) {
    const specification = MODEL_PROFILES[profile];
    if (!specification) throw new RangeError(`Unknown OCR model profile: ${profile}`);
    const directory = path.join(modelDirectory, profile);
    await mkdir(directory, { recursive: true });
    for (const [language, expected] of Object.entries(specification.files)) {
      const file = modelPath(profile, language);
      if (!await validModel(file, expected)) {
        if (offline) throw new Error(`Pinned model is missing or invalid: ${profile}/${language}`);
        const response = await fetch(modelUrl(profile, language), { redirect: "follow" });
        if (!response.ok) throw new Error(`Model download failed (${response.status}): ${profile}/${language}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
          throw new Error(`Downloaded model failed integrity validation: ${profile}/${language}`);
        }
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, file).catch(async error => {
          await rm(temporary, { force: true });
          throw error;
        });
      }
      prepared.push({
        profile,
        language,
        file,
        url: modelUrl(profile, language),
        bytes: expected.bytes,
        sha256: expected.sha256,
      });
    }
  }
  return prepared;
}
