module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('index.js');
  eleventyConfig.addPassthroughCopy('card/index.js');
  eleventyConfig.addPassthroughCopy('ai_comments.json');
  eleventyConfig.addPassthroughCopy('manifest.json');
  eleventyConfig.addPassthroughCopy('sw.js');
  eleventyConfig.addPassthroughCopy('*.png');
  eleventyConfig.addPassthroughCopy('*.ico');
};
