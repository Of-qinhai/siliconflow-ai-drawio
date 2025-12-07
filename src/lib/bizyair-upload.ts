/**
 * BizyAir 文件上传工具
 *
 * 按照 BizyAir 官方文档实现完整的文件上传流程:
 * 1. 获取上传凭证
 * 2. 使用 STS 凭证上传到 OSS
 * 3. 提交输入资源
 */

import crypto from "crypto";

/**
 * 获取上传凭证的响应
 */
interface UploadTokenResponse {
  code: number;
  message: string;
  status: boolean;
  data: {
    file: {
      object_key: string;
      access_key_id: string;
      access_key_secret: string;
      security_token: string;
    };
    storage: {
      endpoint: string;
      bucket: string;
      region: string;
    };
  };
}

/**
 * 提交输入资源的响应
 */
interface CommitResourceResponse {
  code: number;
  message: string;
  status: boolean;
  data: {
    id: number;
    name: string;
    ext: string;
    url: string;
  };
}

/**
 * Base64 转 Blob (Node.js 环境)
 */
function base64ToBlob(base64: string): { blob: Blob; mimeType: string; fileName: string } {
  // 提取 MIME 类型和 base64 数据
  const matches = base64.match(/^data:(.*?);base64,(.*)$/);

  if (!matches) {
    throw new Error("Invalid base64 data URL");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];

  // Node.js 环境：使用 Buffer 转换
  const buffer = Buffer.from(base64Data, "base64");
  const blob = new Blob([buffer], { type: mimeType });

  // 根据 MIME 类型确定文件扩展名
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `diagram-${Date.now()}.${ext}`;

  return { blob, mimeType, fileName };
}

/**
 * 步骤一：获取上传凭证
 */
async function getUploadToken(
  fileName: string,
  apiKey: string
): Promise<UploadTokenResponse> {
  const url = new URL("https://api.bizyair.cn/x/v1/upload/token");
  url.searchParams.append("file_name", fileName);
  url.searchParams.append("file_type", "inputs");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取上传凭证失败: ${response.statusText} - ${errorText}`);
  }

  const result: UploadTokenResponse = await response.json();

  if (result.code !== 20000 || !result.status) {
    throw new Error(`获取上传凭证失败: ${result.message}`);
  }

  return result;
}

/**
 * 生成 OSS 签名
 */
function generateOSSSignature(
  method: string,
  objectKey: string,
  contentType: string,
  date: string,
  bucket: string,
  accessKeySecret: string,
  securityToken?: string
): string {
  // OSS 签名算法
  // Signature = base64(hmac-sha1(AccessKeySecret,
  //   VERB + "\n"
  //   + Content-MD5 + "\n"
  //   + Content-Type + "\n"
  //   + Date + "\n"
  //   + CanonicalizedOSSHeaders
  //   + CanonicalizedResource))

  const contentMd5 = "";
  const canonicalizedOSSHeaders = securityToken
    ? `x-oss-security-token:${securityToken}\n`
    : "";
  const canonicalizedResource = `/${bucket}/${objectKey}`;

  const stringToSign = [
    method,
    contentMd5,
    contentType,
    date,
    canonicalizedOSSHeaders + canonicalizedResource
  ].join("\n");

  // 使用 Node.js crypto 进行 HMAC-SHA1 签名
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha1", accessKeySecret);
  hmac.update(stringToSign);
  const signature = hmac.digest("base64");

  return signature;
}

/**
 * 步骤二：上传到 OSS (使用签名认证)
 *
 * 使用临时凭证和签名上传到阿里云 OSS
 */
async function uploadToOSS(
  buffer: Buffer,
  objectKey: string,
  endpoint: string,
  bucket: string,
  accessKeyId: string,
  accessKeySecret: string,
  securityToken: string,
  contentType: string
): Promise<void> {
  // 构造 OSS 上传 URL
  const ossUrl = `https://${bucket}.${endpoint}/${objectKey}`;

  console.log("[BizyAir Upload] Uploading to OSS:", ossUrl);

  // 生成 GMT 时间
  const date = new Date().toUTCString();

  // 生成签名
  const signature = generateOSSSignature(
    "PUT",
    objectKey,
    contentType,
    date,
    bucket,
    accessKeySecret,
    securityToken
  );

  console.log("[BizyAir Upload] Date:", date);
  console.log("[BizyAir Upload] Signature generated");

  // 使用签名和 STS 临时凭证上传
  const response = await fetch(ossUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": buffer.length.toString(),
      "Date": date,
      "Authorization": `OSS ${accessKeyId}:${signature}`,
      "x-oss-security-token": securityToken,
    },
    body: buffer as any, // Buffer 转为 any 避免类型错误
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[BizyAir Upload] OSS upload error:", errorText);
    throw new Error(`OSS 上传失败 (${response.status}): ${errorText}`);
  }

  console.log("[BizyAir Upload] OSS upload successful");
}

/**
 * 步骤三：提交输入资源
 */
async function commitInputResource(
  fileName: string,
  objectKey: string,
  apiKey: string
): Promise<CommitResourceResponse> {
  const response = await fetch("https://api.bizyair.cn/x/v1/input_resource/commit", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: fileName,
      object_key: objectKey,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`提交输入资源失败: ${response.statusText} - ${errorText}`);
  }

  const result: CommitResourceResponse = await response.json();

  if (result.code !== 20000 || !result.status) {
    throw new Error(`提交输入资源失败: ${result.message}`);
  }

  return result;
}

/**
 * 完整的文件上传流程
 *
 * @param base64Data Base64 编码的图片数据(data:image/png;base64,...)
 * @param apiKey BizyAir API Key
 * @returns 上传后的图片 URL
 */
export async function uploadImageToBizyAir(
  base64Data: string,
  apiKey: string
): Promise<string> {
  console.log("[BizyAir Upload] 开始上传流程...");

  try {
    // 转换 Base64 为 Buffer
    const { blob, mimeType, fileName } = base64ToBlob(base64Data);

    // Blob 转 Buffer (Node.js 环境)
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("[BizyAir Upload] 文件名:", fileName);
    console.log("[BizyAir Upload] 文件大小:", (buffer.length / 1024).toFixed(2), "KB");

    // 步骤一：获取上传凭证
    console.log("[BizyAir Upload] 步骤 1/3: 获取上传凭证...");
    const tokenResponse = await getUploadToken(fileName, apiKey);
    const { file, storage } = tokenResponse.data;

    console.log("[BizyAir Upload] 凭证获取成功");
    console.log("[BizyAir Upload] - Object Key:", file.object_key);
    console.log("[BizyAir Upload] - Bucket:", storage.bucket);
    console.log("[BizyAir Upload] - Region:", storage.region);

    // 步骤二：上传到 OSS
    console.log("[BizyAir Upload] 步骤 2/3: 上传到 OSS...");
    await uploadToOSS(
      buffer,
      file.object_key,
      storage.endpoint,
      storage.bucket,
      file.access_key_id,
      file.access_key_secret,
      file.security_token,
      mimeType
    );

    console.log("[BizyAir Upload] OSS 上传成功");

    // 步骤三：提交输入资源
    console.log("[BizyAir Upload] 步骤 3/3: 提交输入资源...");
    const commitResponse = await commitInputResource(
      fileName,
      file.object_key,
      apiKey
    );

    const imageUrl = commitResponse.data.url;
    console.log("[BizyAir Upload] 上传完成!");
    console.log("[BizyAir Upload] 图片 URL:", imageUrl);

    return imageUrl;

  } catch (error) {
    console.error("[BizyAir Upload] 上传失败:", error);
    throw error;
  }
}

/**
 * 查询已上传的输入资源列表(可选)
 */
export async function listInputResources(
  apiKey: string,
  page = 1,
  pageSize = 20
): Promise<any> {
  const url = new URL("https://api.bizyair.cn/x/v1/input_resource");
  url.searchParams.append("current", page.toString());
  url.searchParams.append("page_size", pageSize.toString());

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`查询输入资源失败: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}
