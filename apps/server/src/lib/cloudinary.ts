import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

console.log('[Cloudinary] Config:', {
  cloud_name: (env as any).CLOUDINARY_CLOUD_NAME,
  api_key: (env as any).CLOUDINARY_API_KEY ? '***' + ((env as any).CLOUDINARY_API_KEY as string).slice(-4) : 'MISSING',
  api_secret: (env as any).CLOUDINARY_API_SECRET ? 'PRESENT' : 'MISSING',
});

cloudinary.config({
  cloud_name: (env as any).CLOUDINARY_CLOUD_NAME,
  api_key: (env as any).CLOUDINARY_API_KEY,
  api_secret: (env as any).CLOUDINARY_API_SECRET,
});

export { cloudinary };

export async function uploadToCloudinary(
  file: Buffer,
  folder: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<{ url: string; public_id: string; duration?: number }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Upload failed: empty result'));
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          duration: result.duration,
        });
      }
    );

    uploadStream.end(file);
  });
}
