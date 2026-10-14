/** Fields omitted from a viewer's payload must not erase stored working hours. */
function preserveSubTaskHours(nextSubTasks, existingSubTasks = []) {
  if (!Array.isArray(nextSubTasks)) return nextSubTasks;
  const existing = new Map((existingSubTasks || []).map(task => [task.id, task]));
  return nextSubTasks.map(task => {
    const previous = existing.get(task.id);
    const merged = { ...task };
    for (const field of ['estimatedHours', 'actualHours']) {
      if (merged[field] === undefined && previous?.[field] !== undefined) merged[field] = previous[field];
    }
    return merged;
  });
}

module.exports = { preserveSubTaskHours };
