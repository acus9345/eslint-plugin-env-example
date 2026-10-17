import { envReadVisitor } from "../env-access.js";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow reading environment variables through computed keys, which no tool can check",
      recommended: true,
      url: "https://github.com/acus9345/eslint-plugin-env-example/blob/main/docs/rules/no-dynamic-env.md",
    },
    schema: [],
    messages: {
      dynamic:
        "This {{source}} read uses a key computed at runtime, so it cannot be checked against .env.example. Use a fixed name instead (e.g. process.env.API_URL), or disable this line with an eslint-disable comment if the dynamic lookup is intended.",
    },
  },

  create(context) {
    return envReadVisitor(({ name, source, node }) => {
      if (name === null) context.report({ node, messageId: "dynamic", data: { source } });
    });
  },
};

export default rule;
