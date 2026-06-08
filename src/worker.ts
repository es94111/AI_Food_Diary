import { Queue, Worker } from "bullmq";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined
  };
}

const connection = redisConnection();

export const aiQueue = new Queue("ai-food-diary", { connection });

new Worker(
  "ai-food-diary",
  async (job) => {
    console.log("Received job %s", job.name, job.data);
  },
  { connection }
);

console.log("AI Food Diary worker is running");
