/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Environment variables for server-side runtime access
  env: {
    USE_S3_STORAGE: process.env.USE_S3_STORAGE,
    PANOR_AWS_ACCESS_KEY_ID: process.env.PANOR_AWS_ACCESS_KEY_ID,
    PANOR_AWS_SECRET_ACCESS_KEY: process.env.PANOR_AWS_SECRET_ACCESS_KEY,
    PANOR_AWS_S3_BUCKET_NAME: process.env.PANOR_AWS_S3_BUCKET_NAME,
    PANOR_AWS_REGION: process.env.PANOR_AWS_REGION,
  },
  // API configuration should be handled in individual API route files
  // Body parser and response limits are configured per route
  webpack: (config, { isServer }) => {
    // Handle PDF.js worker files
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    
    // Copy PDF.js worker files
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]',
      },
    });
    
    return config;
  },
};

module.exports = nextConfig;
