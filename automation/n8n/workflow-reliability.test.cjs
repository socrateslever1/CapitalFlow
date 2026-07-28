const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowsDir = path.join(__dirname, "workflows");
const readWorkflow = (name) =>
  JSON.parse(fs.readFileSync(path.join(workflowsDir, name), "utf8"))[0];

test("manual collection workflow carries lock identity through both acknowledgements", () => {
  const workflow = readWorkflow("capitalflow-manual-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.match(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);
  assert.match(serialized, /lock_token/);
  assert.equal(workflow.nodes.find((node) => node.name === "Every 30 Seconds") !== undefined, true);

  const outputs = workflow.connections["Send Manual Collection"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Manual Collection");
  assert.equal(outputs[1][0].node, "Fail Manual Collection");
});

test("daily collection workflow acknowledges success and failure without a fixed tenant", () => {
  const workflow = readWorkflow("capitalflow-daily-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.match(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);

  const sender = workflow.nodes.find((node) => node.name === "Send WhatsApp");
  assert.equal(sender.onError, "continueErrorOutput");

  const outputs = workflow.connections["Send WhatsApp"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Sent");
  assert.equal(outputs[1][0].node, "Fail Dispatch");
});
