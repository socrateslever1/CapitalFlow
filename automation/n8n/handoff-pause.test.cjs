'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase', 'functions', 'capitalflow-n8n-tools', 'index.ts'),
  'utf8',
);

test('pauses automatic replies while a human handoff is active', () => {
  assert.match(source, /status: "human_handoff_active"/);
  assert.match(source, /audience: "internal_only"/);
  assert.match(source, /\.in\("status", \["OPEN", "IN_PROGRESS"\]\)/);
});

test('allows an explicit return to the robot and closes stale handoffs', () => {
  assert.match(source, /voltar ao robo\|retomar robo\|retomar atendimento automatico/);
  assert.match(source, /12 \* 60 \* 60 \* 1000/);
  assert.match(source, /status: "CLOSED", closed_at:/);
});

test('does not create duplicate handoffs or notifications', () => {
  assert.match(source, /if \(!existingHandoff\.data\)/);
  assert.match(source, /robot_paused: suppliedDigits === "3"/);
});

test('schedules the busy reminder for fifteen minutes and cancels it on a human reply', () => {
  assert.match(source, /15 \* 60 \* 1000/);
  assert.match(source, /reminder_scheduled_for: reminderScheduledFor/);
  assert.match(source, /handoff-reminder:/);
  assert.match(source, /Atendente ocupado, em breve responderemos/);
  assert.match(source, /action === "operator_reply"/);
  assert.match(source, /Lembrete cancelado: atendente respondeu/);
});

test('uses thematic emojis in handoff messages', () => {
  assert.match(source, /🙋 Certo!/u);
  assert.match(source, /⏳ Atendente ocupado/u);
  assert.match(source, /💬 Obrigado/u);
});
