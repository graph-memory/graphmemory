import { useMemo } from 'react';
import type { Task } from '@/entities/task/api.ts';
import type { GroupByField, GroupDefinition, GroupContext } from '@/entities/task/groupConfig.ts';
import { GROUP_CONFIGS } from '@/entities/task/groupConfig.ts';

export interface GroupedResult {
  groups: GroupDefinition[];
  tasksByGroup: Map<string, Task[]>;
}

export function useGroupedTasks(
  filteredTasks: Task[],
  groupBy: GroupByField,
  context: GroupContext,
  sortFn: (a: Task, b: Task) => number,
): GroupedResult {
  return useMemo(() => {
    const config = GROUP_CONFIGS[groupBy];
    if (!config || groupBy === 'none') {
      return {
        groups: [{ key: '__all__', label: '', color: '', sortOrder: 0 }],
        tasksByGroup: new Map([['__all__', [...filteredTasks].sort(sortFn)]]),
      };
    }

    const groups = config.buildGroups(filteredTasks, context);
    const map = new Map<string, Task[]>();
    for (const g of groups) map.set(g.key, []);

    const nullKey = '__none__';
    let hasNull = false;

    for (const task of filteredTasks) {
      const keys = config.getKeys(task, context);
      if (keys.length === 0) {
        hasNull = true;
        if (!map.has(nullKey)) map.set(nullKey, []);
        map.get(nullKey)!.push(task);
      } else {
        for (const key of keys) {
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(task);
        }
      }
    }

    // Sort within groups
    for (const [, list] of map) list.sort(sortFn);

    // Add null group definition if needed
    const allGroups = [...groups];
    if (hasNull) {
      allGroups.push({
        key: nullKey,
        label: config.nullGroupLabel,
        color: config.nullGroupColor,
        sortOrder: Infinity,
      });
    }

    // Remove empty groups
    const finalGroups = allGroups.filter(g => (map.get(g.key)?.length ?? 0) > 0);

    return { groups: finalGroups, tasksByGroup: map };
  }, [filteredTasks, groupBy, context, sortFn]);
}
