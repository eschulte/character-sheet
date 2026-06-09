export default function (eleventyConfig) {
  eleventyConfig.setServerPassthroughCopyBehavior('passthrough');

  eleventyConfig.addPassthroughCopy({ 'index.js': 'index.js' });
  eleventyConfig.addPassthroughCopy({ 'card/index.js': 'card/index.js' });
  eleventyConfig.addPassthroughCopy({ 'ai_comments.json': 'ai_comments.json' });
  eleventyConfig.addPassthroughCopy({ 'manifest.json': 'manifest.json' });
  eleventyConfig.addPassthroughCopy({ 'sw.js': 'sw.js' });
  eleventyConfig.addPassthroughCopy({ 'favicon.ico': 'favicon.ico' });
  eleventyConfig.addPassthroughCopy({ 'apple-touch-icon-180x180.png': 'apple-touch-icon-180x180.png' });
  eleventyConfig.addPassthroughCopy({ 'maskable-icon-512x512.png': 'maskable-icon-512x512.png' });
  eleventyConfig.addPassthroughCopy({ 'pwa-64x64.png': 'pwa-64x64.png' });
  eleventyConfig.addPassthroughCopy({ 'pwa-192x192.png': 'pwa-192x192.png' });
  eleventyConfig.addPassthroughCopy({ 'pwa-512x512.png': 'pwa-512x512.png' });
  eleventyConfig.addPassthroughCopy({ 'icon.png': 'icon.png' });

  return { htmlTemplateEngine: false, templateFormats: ['html', 'md'], passthroughFileCopy: true };
}
