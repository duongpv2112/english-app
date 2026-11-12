import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Uploader } from './tts.ts'

/** An Uploader that stores files in a Cloudflare R2 bucket through its S3-compatible API. */
export function createR2Uploader(cfg: {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}): Uploader {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  return async (key, body) => {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: 'audio/mpeg',
        // Keys contain the row id and the audio for a row never changes once uploaded.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  }
}
