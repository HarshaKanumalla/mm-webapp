module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended"
  ],
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    "no-case-declarations": "off",
    indent: "off",
    "max-len": "off"
  }
};