const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowsDir = path.join(__dirname, "workflows");
const readWorkflow = (name) =>
  JSON.parse(fs.readFileSync(path.join(workflowsDir, name), "utf8"))[0];

test("manual collection workflow runs on demand for only the requested tenant", () => {
  const workflow = readWorkflow("capitalflow-manual-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.doesNotMatch(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.doesNotMatch(serialized, /claim_all/);
  assert.match(serialized, /action: 'claim'/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);
  assert.match(serialized, /lock_token/);
  assert.equal(workflow.nodes.some((node) => node.type === "n8n-nodes-base.scheduleTrigger"), false);
  const trigger = workflow.nodes.find((node) => node.name === "Manual Collection Requested");
  assert.equal(trigger.type, "n8n-nodes-base.webhook");
  assert.equal(trigger.parameters.path, "capitalflow-manual-collections-trigger");
  assert.equal(workflow.settings.saveDataSuccessExecution, "all");
  assert.equal(workflow.settings.saveExecutionProgress, false);

  const claim = workflow.nodes.find((node) => node.name === "Claim Pending Collections");
  assert.equal(claim.retryOnFail, undefined);
  assert.equal(claim.onError, "continueRegularOutput");

  const outputs = workflow.connections["Send Manual Collection"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Manual Collection");
  assert.equal(outputs[1][0].node, "Fail Manual Collection");
});

test("custom collection messages bypass AI and remove the internal marker", () => {
  const workflow = readWorkflow("capitalflow-manual-collections.json");
  const gate = workflow.nodes.find((node) => node.name === "Is Custom Message");
  const prepare = workflow.nodes.find((node) => node.name === "Prepare Custom Message");

  assert.ok(gate);
  assert.match(JSON.stringify(gate.parameters), /CF_CUSTOM/);
  assert.match(prepare.parameters.jsCode, /replace/);
  assert.equal(workflow.connections["Is Custom Message"].main[0][0].node, "Prepare Custom Message");
  assert.equal(workflow.connections["Is Custom Message"].main[1][0].node, "Local AI Naturalize");
  assert.equal(workflow.connections["Prepare Custom Message"].main[0][0].node, "Guard Financial Facts");
});

test("operator routing uses the phone resolved from the current WhatsApp item", () => {
  const workflow = JSON.parse(
    fs.readFileSync(path.join(__dirname, "capitalflow-whatsapp.json"), "utf8"),
  )[0];
  const adminCommand = workflow.nodes.find((node) => node.name === "Admin Command");

  assert.ok(adminCommand);
  assert.equal(adminCommand.type, "n8n-nodes-base.executeWorkflow");
  assert.equal(adminCommand.parameters.workflowId, "capitalflowOperatorSystem");
  assert.equal(adminCommand.parameters.options.waitForSubWorkflow, true);
  assert.equal(workflow.nodes.some((node) => node.name === "Admin Conversation"), false);
  assert.equal(workflow.nodes.some((node) => node.name === "Admin Conversation Guard"), false);
  assert.equal(workflow.connections["Admin Gate"].main[0][0].node, "Admin Reply");
});

test("operator identity accepts legitimate Brazilian WhatsApp phone variants", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "capitalflow-admin-whatsapp", "index.ts"),
    "utf8",
  );

  assert.match(source, /function phoneIdentityVariants/);
  assert.match(source, /national\[2\] === "9"/);
  assert.match(source, /\.in\("phone_hash", phoneHashes\)/);
});

test("administrative WhatsApp accepts a bare CPF as a client lookup", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "capitalflow-admin-whatsapp", "index.ts"),
    "utf8",
  );

  assert.match(source, /const bareDocument = digits\(rawMessage\)/);
  assert.match(source, /\[11, 14\]\.includes\(bareDocument\.length\)/);
  assert.match(source, /document\.eq\.\$\{document\},cpf\.eq\.\$\{document\}/);
  assert.match(source, /openClientOperationalPanel\(adminDb, profileId, admin, found\.client, "status"\)/);
});

test("operator traffic is isolated in a dedicated workflow before client handling", () => {
  const operatorWorkflow = readWorkflow("capitalflow-operator-system.json");
  const attendanceWorkflow = JSON.parse(
    fs.readFileSync(path.join(__dirname, "capitalflow-whatsapp.json"), "utf8"),
  )[0];
  const router = attendanceWorkflow.nodes.find((node) => node.name === "Admin Command");
  const secureCommand = operatorWorkflow.nodes.find((node) => node.name === "Secure Operator Command");
  const routeGuard = operatorWorkflow.nodes.find((node) => node.name === "Operator Route Guard");
  const trigger = operatorWorkflow.nodes.find((node) => node.name === "Operator Workflow Input");

  assert.match(operatorWorkflow.name, /Operador/);
  assert.equal(operatorWorkflow.active, false);
  assert.equal(router.type, "n8n-nodes-base.executeWorkflow");
  assert.equal(router.parameters.workflowId, operatorWorkflow.id);
  assert.equal(trigger.type, "n8n-nodes-base.executeWorkflowTrigger");
  assert.doesNotMatch(JSON.stringify(router.parameters), /CAPITALFLOW_N8N_SECRET/);
  assert.match(secureCommand.parameters.url, /capitalflow-admin-whatsapp/);
  assert.match(routeGuard.parameters.jsCode, /result\.admin === true && result\.handled === true/);
  assert.match(routeGuard.parameters.jsCode, /result\.audience === 'public'/);
});

test("administrative contract labels are rendered in Portuguese", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "capitalflow-admin-whatsapp", "index.ts"),
    "utf8",
  );

  assert.match(source, /MONTHLY: "Mensal"/);
  assert.match(source, /PENDING: "Pendente"/);
  assert.match(source, /contractStatusLabel\(item\.status\)/);
});

test("daily collection workflow acknowledges success and failure without a fixed tenant", () => {
  const workflow = readWorkflow("capitalflow-daily-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.match(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);

  const sender = workflow.nodes.find((node) => node.name === "Send WhatsApp");
  assert.equal(sender.onError, "continueErrorOutput");
  assert.equal(sender.type, "n8n-nodes-base.httpRequest");
  assert.match(sender.parameters.url, /waha:3000\/api\/sendText/);

  const outputs = workflow.connections["Send WhatsApp"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Sent");
  assert.equal(outputs[1][0].node, "Fail Dispatch");
});

test("collection workflows block malformed UTF-8 before WhatsApp delivery", () => {
  for (const name of [
    "capitalflow-manual-collections.json",
    "capitalflow-daily-collections.json",
  ]) {
    const workflow = readWorkflow(name);
    const guard = workflow.nodes.find((node) => node.name === "Guard Financial Facts");

    assert.ok(guard);
    assert.match(guard.parameters.jsCode, /codificacao invalida/);
    assert.match(guard.parameters.jsCode, /repair/);
    assert.match(guard.parameters.jsCode, /corrupted\.test\(message\)/);
    assert.doesNotThrow(() => new Function(guard.parameters.jsCode));
  }
});

test("collection Edge Functions validate message encoding at the source", () => {
  for (const name of [
    "capitalflow-manual-collections",
    "capitalflow-daily-collections",
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "supabase", "functions", name, "index.ts"),
      "utf8",
    );

    assert.match(source, /assertCleanEncoding/);
    assert.match(source, /message_encoding_invalid/);
  }
});

test("daily collections use configured time slots and stop without open balance", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "capitalflow-daily-collections", "index.ts"),
    "utf8",
  );

  assert.match(source, /policy\.send_hours/);
  assert.match(source, /configuredHours\.includes\(currentHour\)/);
  assert.match(source, /scheduled_hour: currentHour/);
  assert.match(source, /if \(amount <= 0\.05\) continue/);
});

test("InfinitePay queues one receipt for the client and one payment alert for the operator", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "functions", "infinitepay-webhook", "index.ts"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "..", "supabase", "migrations", "20260805002000_add_whatsapp_queue_dedupe_key.sql"),
    "utf8",
  );

  assert.match(source, /async function queuePaymentNotifications/);
  assert.match(source, /category: "CONFIRMACAO"/);
  assert.match(source, /category: "AVISO"/);
  assert.match(source, /Comprovante:/);
  assert.match(source, /pagou \$\{money\(approvedAmount\)\}/);
  assert.match(source, /onConflict: "dedupe_key", ignoreDuplicates: true/);
  assert.doesNotMatch(source, /functions\/v1\/whatsapp-send/);
  assert.match(migration, /unique index if not exists whatsapp_queue_dedupe_key_uidx/);

  const workflow = readWorkflow("capitalflow-manual-collections.json");
  assert.equal(workflow.connections["Is Custom Message"].main[0][0].node, "Prepare Custom Message");
});

test("customer support uses interactive menus and link buttons with text fallback", () => {
  const workflow = readWorkflow("capitalflow-whatsapp.json");
  const prepare = workflow.nodes.find((node) => node.name === "Prepare WhatsApp Message");
  const sender = workflow.nodes.find((node) => node.name === "Send WhatsApp Reply");
  const fallback = workflow.nodes.find((node) => node.name === "Fallback WhatsApp Text");

  assert.ok(prepare);
  assert.match(prepare.parameters.jsCode, /api\/sendList/);
  assert.match(prepare.parameters.jsCode, /api\/sendButtons/);
  assert.match(prepare.parameters.jsCode, /consultar_divida/);
  assert.match(prepare.parameters.jsCode, /solicitar_emprestimo/);
  assert.match(prepare.parameters.jsCode, /falar_atendente/);
  assert.match(prepare.parameters.jsCode, /Falar com operador/);
  assert.match(prepare.parameters.jsCode, /Abrir portal/);
  assert.equal(sender.parameters.url, "={{ $json.endpoint }}");
  assert.equal(sender.onError, "continueErrorOutput");
  assert.equal(fallback.parameters.url, "http://waha:3000/api/sendText");
  assert.equal(workflow.connections["Output Guard"].main[0][0].node, "Prepare WhatsApp Message");
  assert.equal(workflow.connections["Send WhatsApp Reply"].main[1][0].node, "Fallback WhatsApp Text");
});
