import pluginVue from 'eslint-plugin-vue';
import vueConfigPrettier from '@vue/eslint-config-prettier';

export default [
  ...pluginVue.configs['flat/recommended'],
  vueConfigPrettier,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
    },
  },
  {
    ignores: ['dist/', 'server/'],
  },
];
