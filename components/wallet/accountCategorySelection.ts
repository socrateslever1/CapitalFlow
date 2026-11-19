export type AccountCategorySelection = { value: string; customMode: boolean };

export type AccountCategoryAction =
  | { type: 'select'; value: string }
  | { type: 'type'; value: string }
  | { type: 'reset' };

export const initialAccountCategorySelection: AccountCategorySelection = {
  value: 'Outros', customMode: false,
};

export const accountCategoryReducer = (
  state: AccountCategorySelection,
  action: AccountCategoryAction,
): AccountCategorySelection => {
  if (action.type === 'reset') return initialAccountCategorySelection;
  if (action.type === 'select') return action.value === '__custom__'
    ? { value: '', customMode: true }
    : { value: action.value, customMode: false };
  return { ...state, value: action.value };
};
