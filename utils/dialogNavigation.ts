type DialogEntry = { back: () => void };
const dialogs: DialogEntry[] = [];

export function registerDialogBack(back: () => void) {
  const entry = { back };
  dialogs.push(entry);
  return {
    isTop: () => dialogs.at(-1) === entry,
    dispose: () => {
      const index = dialogs.indexOf(entry);
      if (index >= 0) dialogs.splice(index, 1);
    },
  };
}

export function requestDialogBack(): boolean {
  const dialog = dialogs.at(-1);
  if (!dialog) return false;
  dialog.back();
  return true;
}
