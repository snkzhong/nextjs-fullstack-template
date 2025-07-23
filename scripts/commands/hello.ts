export default {
  name: "hello",
  description: "this is only test command",
  argumentList: [
    ["<string>", "string to display"],
  ],
  optionList: [
    ['-n, --name <name>', 'Name to greet', 'World'],
  ],
  action: (str, options) => {
    console.log(`Hello, ${str}!`, options);
  }
}