// Запуск книг из очереди geroenok-start (см. startBook в api.js). Workflow, созданный отсюда, а не из запроса
// покупателя, OpenAI пропускает и для заказов из РФ (проверено 26.09).
// Повтор сообщения не страшен: второй экземпляр Workflow с тем же id Cloudflare не создаёт.

export async function queueHandler(batch, env) {
  for (const msg of batch.messages) {
    const { instance, id, mode } = msg.body;
    try {
      await env.BOOK_WORKFLOW.create({ id: instance, params: { id, mode } });
    } catch (error) {
      if (!/already exists/i.test(error?.message || '')) {
        console.error(`[queue] ${instance}: ${error?.message || error}`);
        msg.retry();
        continue;
      }
    }
    msg.ack();
  }
}
