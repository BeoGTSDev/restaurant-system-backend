// Test file: checks kitchenWorkflowService.test behavior and protects it from later changes.
const {
    getKitchenAction, canApplyKitchenAction, getKitchenTiming
} = require('../src/services/kitchenWorkflowService');

describe('kitchenWorkflowService', () => {
    test.each([
        ['FIRE', 'Pending', 'Fired'],
        ['COOK', 'Fired', 'Cooking'],
        ['PICKUP', 'Cooking', 'Pickup'],
        ['DONE', 'Pickup', 'Served'],
        ['FAIL', 'Cooking', 'Remake'],
        ['CANCEL', 'Pending', 'Cancelled']
    ])('%s moves %s to %s', (action, from, to) => {
        const definition = getKitchenAction(action);
        expect(definition.allowed).toContain(from);
        expect(definition.status).toBe(to);
    });

    test('action lookup is case insensitive', () => {
        expect(getKitchenAction('fire')).toEqual(getKitchenAction('FIRE'));
    });

    test('unknown action is rejected', () => {
        expect(getKitchenAction('BOIL')).toBeNull();
    });

    test('all selected items must have compatible statuses', () => {
        expect(canApplyKitchenAction('COOK', ['Fired', 'Remake'])).toBe(true);
        expect(canApplyKitchenAction('COOK', ['Fired', 'Pending'])).toBe(false);
    });

    test('empty selection is invalid', () => {
        expect(canApplyKitchenAction('FIRE', [])).toBe(false);
    });

    test('pending items do not start a preparation timer', () => {
        expect(getKitchenTiming({
            status: 'Pending', updatedAt: '2026-07-31T10:00:00Z', prepMinutes: 5
        })).toEqual({ processStartedAt: null, expectedAt: null, remainingMs: null, overdue: false });
    });

    test('cooking timer counts down from cookingAt', () => {
        const result = getKitchenTiming({
            status: 'Cooking',
            cookingAt: '2026-07-31T10:00:00Z',
            prepMinutes: 5,
            now: '2026-07-31T10:03:00Z'
        });
        expect(result.expectedAt.toISOString()).toBe('2026-07-31T10:05:00.000Z');
        expect(result.remainingMs).toBe(120000);
        expect(result.overdue).toBe(false);
    });

    test('legacy cooking row falls back to updatedAt', () => {
        const result = getKitchenTiming({
            status: 'Cooking',
            updatedAt: '2026-07-31T10:00:00Z',
            prepMinutes: 5,
            now: '2026-07-31T10:06:00Z'
        });
        expect(result.remainingMs).toBe(-60000);
        expect(result.overdue).toBe(true);
    });

    test('served item is not marked overdue', () => {
        const result = getKitchenTiming({
            status: 'Served',
            cookingAt: '2026-07-31T10:00:00Z',
            prepMinutes: 5,
            now: '2026-07-31T10:10:00Z'
        });
        expect(result.overdue).toBe(false);
    });
});
