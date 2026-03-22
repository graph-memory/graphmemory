/** Найти узел по идентификатору в графе */
export function findNode(id: string): unknown {
  return id;
}

/** Обработчик событий — создаёт подписку */
export class EventHandler {
  subscribe(name: string): void {
    console.log(name);
  }
}

/** Emoji test: handles 🔥 hot reload */
export const hotReload = (path: string) => {
  return path;
};

/** Type with unicode: Данные<Результат> */
export interface Данные {
  значение: string;
  количество: number;
}

/** Arrow with multi-byte: café ☕ handler */
export const caféHandler = async (req: unknown): Promise<void> => {
  await req;
};
