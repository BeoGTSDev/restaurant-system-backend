// Service file: holds reusable kitchenWorkflowService business rules.
// The backend is the final judge of every kitchen state move shown by the UI.
const KITCHEN_ACTIONS = Object.freeze({
    FIRE: { allowed: ['Pending'], status: 'Fired', priority: 'NORMAL', timestamp: 'firedAt' },
    ASAP: { allowed: ['Pending', 'Fired', 'Remake'], status: 'Fired', priority: 'ASAP', timestamp: 'firedAt' },
    COOK: { allowed: ['Fired', 'Remake'], status: 'Cooking', timestamp: 'cookingAt' },
    PICKUP: { allowed: ['Cooking'], status: 'Pickup', timestamp: 'pickupAt' },
    DONE: { allowed: ['Pickup', 'Ready'], status: 'Served', timestamp: 'servedAt' },
    FAIL: { allowed: ['Fired', 'Cooking', 'Pickup', 'Ready', 'Served'], status: 'Remake', priority: 'REMAKE', timestamp: 'firedAt' },
    CANCEL: { allowed: ['Pending', 'Fired', 'Cooking', 'Pickup', 'Ready', 'Remake'], status: 'Cancelled' }
});

// Business rule: loads get kitchen action data. A controller passes values in and receives the result.
const getKitchenAction = action => KITCHEN_ACTIONS[String(action || '').toUpperCase()] || null;

// Business rule: checks can apply kitchen action and returns a safe yes/no result. A controller passes values in and receives the result.
const canApplyKitchenAction = (action, statuses) => {
    const definition = getKitchenAction(action);
    return Boolean(definition)
        && Array.isArray(statuses)
        && statuses.length > 0
        && statuses.every(status => definition.allowed.includes(status));
};

// Business rule: loads get kitchen timing data. A controller passes values in and receives the result.
const getKitchenTiming = ({ status, cookingAt, updatedAt, prepMinutes, now = new Date() }) => {
    const effectiveCookingAt = cookingAt || (status === 'Cooking' ? updatedAt : null);
    if (!effectiveCookingAt) {
        return { processStartedAt: null, expectedAt: null, remainingMs: null, overdue: false };
    }
    const processStartedAt = new Date(effectiveCookingAt);
    const expectedAt = new Date(processStartedAt.getTime() + Number(prepMinutes) * 60000);
    const remainingMs = expectedAt.getTime() - new Date(now).getTime();
    return {
        processStartedAt,
        expectedAt,
        remainingMs,
        overdue: status === 'Cooking' && remainingMs < 0
    };
};

module.exports = { KITCHEN_ACTIONS, getKitchenAction, canApplyKitchenAction, getKitchenTiming };
