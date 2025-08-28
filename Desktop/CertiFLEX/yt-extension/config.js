// config.js - Configuration for different environments
const config = {
  development: {
    apiBase: 'https://yt2certify.onrender.com', // Force production URL
    name: 'Development (using Production API)'
  },
  production: {
    apiBase: 'https://yt2certify.onrender.com',
    name: 'Production'
  }
};

// Force production mode to use Render backend
const isDevelopment = false; // Force to false to always use production API
const currentConfig = config.production; // Always use production config

console.log(`🔧 YT Extension running in ${currentConfig.name} mode`);
console.log(`🌐 API Base: ${currentConfig.apiBase}`);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { config, currentConfig, isDevelopment };
} else {
  window.YTConfig = { config, currentConfig, isDevelopment };
}
