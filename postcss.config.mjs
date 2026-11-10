import postcssPresetEnv from 'postcss-preset-env';
import postcssCascadeLayers from '@csstools/postcss-cascade-layers';

/**
 * Vite inlines the @import graph before running these PostCSS plugins.
 * Keep cascade-layers last: it must receive the complete ordered stylesheet.
 */
export default {
  plugins: [
    postcssPresetEnv({
      // Explicit feature list keeps the output changes narrow and predictable.
      stage: false,
      features: {
        'oklab-function': { preserve: false },
        'color-mix': { preserve: false },
        'nesting-rules': true,
      },
      // Autoprefixer is included by Preset Env and uses .browserslistrc.
      autoprefixer: { flexbox: 'no-2009' },
    }),
    postcssCascadeLayers({
      onRevertLayerKeyword: 'warn',
      onConditionalRulesChangingLayerOrder: 'warn',
    }),
  ],
};
