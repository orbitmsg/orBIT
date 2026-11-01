import { create } from 'zustand';

interface MessageEditState {
  editingIndex: number | null;
  editingOriginalText: string;
  editText: string;
  setEditing: (index: number | null, text?: string) => void;
  setEditText: (text: string | ((prev: string) => string)) => void;
  clearEditing: () => void;
}

export const useMessageEditStore = create<MessageEditState>((set) => ({
  editingIndex: null,
  editingOriginalText: '',
  editText: '',
  setEditing: (index, text = '') =>
    set({
      editingIndex: index,
      editingOriginalText: text,
      editText: text,
    }),
  setEditText: (text) =>
    set((state) => ({
      editText: typeof text === 'function' ? text(state.editText) : text,
    })),
  clearEditing: () =>
    set({
      editingIndex: null,
      editingOriginalText: '',
      editText: '',
    }),
}));
