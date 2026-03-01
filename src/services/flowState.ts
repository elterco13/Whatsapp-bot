/**
 * Simple in-memory state management for user conversations.
 * Useful for multi-turn interactions like /CITA where we need clarifying questions.
 */

export interface ConversationState {
    step: 'WAITING_FOR_DATE' | 'WAITING_FOR_SUBJECT' | 'CONFIRMATION' | 'WAITING_FOR_INPUT';
    data: any; // Partial data collected so far
    command: 'CITA' | 'RECETA' | 'FINANCE' | 'TODO' | 'SHOPPING' | 'DONE_SELECTION' | 'LISTS_MENU' | 'RECIPES_SUBMENU' | 'RECIPE_SEARCH' | 'GASTO_DEDUCTIBLE' | 'EXTRACTO_BANCO' | 'INGRESO_FACTURA' | 'INGRESO_CLIENTE_SELECCION' | 'OTHER';
}

const stateMap = new Map<string, ConversationState>();

export const flowState = {
    get: (userId: string) => stateMap.get(userId),
    set: (userId: string, state: ConversationState) => stateMap.set(userId, state),
    clear: (userId: string) => stateMap.delete(userId),
};
