export const toolsV1 = {
  get_open_prs: {
    description: "Lists open pull requests for the configured demo repo.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    handler: async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                number: 1,
                title: "Add user authentication",
                author: "alice",
              },
              {
                number: 2,
                title: "Improve dashboard performance",
                author: "bob",
              },
              {
                number: 3,
                title: "Update documentation",
                author: "charlie",
              },
            ]),
          },
        ],
      };
    },
  },

  summarize_pr: {
    description:
      "Summarizes a given PR number using the demo repo's fake PR data.",
    inputSchema: {
      type: "object",
      properties: {
        pr_number: {
          type: "number",
          description: "The pull request number to summarize.",
        },
      },
      required: ["pr_number"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    handler: async (args: { pr_number: number }) => {
      return {
        content: [
          {
            type: "text",
            text: `PR #${args.pr_number}: This is a benign demo pull request with a normal code change and no security-sensitive behavior.`,
          },
        ],
      };
    },
  },
};