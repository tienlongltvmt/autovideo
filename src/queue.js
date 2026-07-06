// hàng đợi giới hạn số tác vụ chạy đồng thời
export class Queue {
    #concurrency;
    #running = 0;
    #waiting = [];

    constructor(concurrency) {
        this.#concurrency = concurrency;
    }

    push(task) {
        return new Promise((resolve, reject) => {
            this.#waiting.push({ task, resolve, reject });
            this.#next();
        });
    }

    #next() {
        while (this.#running < this.#concurrency && this.#waiting.length) {
            const { task, resolve, reject } = this.#waiting.shift();
            this.#running++;
            Promise.resolve()
                .then(task)
                .then(resolve, reject)
                .finally(() => {
                    this.#running--;
                    this.#next();
                });
        }
    }

    get running() {
        return this.#running;
    }

    get pending() {
        return this.#waiting.length;
    }
}
