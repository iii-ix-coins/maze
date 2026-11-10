
import postcssPresetEnv from 'postcss-preset-env';
import postcssCascadeLayers from '@csstools/postcss-cascade-layers';

import postcssOKLab from '@csstools/postcss-oklab-function';
import postcssColorMix from '@csstools/postcss-color-mix-function';

export default {
    plugins: [
        postcssPresetEnv({
            stage: 3,

            features: {
                'cascade-layers': false,
                'oklab-function': false,
                'color-mix': false,
                'nesting-rules': true
            }
        }),

        postcssOKLab({
            preserve: false,
            enableProgressiveCustomProperties: true
        }),

        postcssColorMix({
            preserve: false
        }),

        postcssCascadeLayers({
            onRevertLayerKeyword: 'warn',
            onConditionalRulesChangingLayerOrder: 'warn'
        })
    ]
};
