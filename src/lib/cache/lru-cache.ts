/** Guards against cycles and pathologically deep structures. */
const MAX_ESTIMATE_DEPTH = 8;

function estimateBytes(value: unknown, depth: number): number {
	if (value === null || value === undefined) return 4;

	switch (typeof value) {
		case 'string':
			// Approximates the serialised UTF-8 byte count, which is 1 byte per char for
			// the ASCII that dominates chat content. Using UTF-16 code units instead
			// would roughly double every estimate and halve the effective capacity.
			return value.length + 2;
		case 'number':
			return 8;
		case 'boolean':
			return 4;
		case 'object':
			break;
		default:
			return 8;
	}

	if (depth >= MAX_ESTIMATE_DEPTH) return 64;
	if (value instanceof Date) return 26;

	if (Array.isArray(value)) {
		let total = 2;
		for (const entry of value) total += estimateBytes(entry, depth + 1) + 1;
		return total;
	}

	// for..in rather than Object.entries: the latter allocates a [key, value] pair
	// array for every object visited, which is the bulk of the work on a message list.
	let total = 2;
	for (const key in value) {
		total += key.length + 3 + estimateBytes((value as Record<string, unknown>)[key], depth + 1);
	}
	return total;
}

interface CacheNode<K, V> {
	key: K;
	value: V;
	size: number;
	prev: CacheNode<K, V> | null;
	next: CacheNode<K, V> | null;
}

export class LRUCache<K = string, V = unknown> {
	private capacity: number;
	private currentSize = 0;
	private cache = new Map<K, CacheNode<K, V>>();
	private head: CacheNode<K, V> | null = null;
	private tail: CacheNode<K, V> | null = null;

	constructor(maxSizeBytes = 1024 * 1024) {
		this.capacity = maxSizeBytes;
	}

	/**
	 * Approximate byte size by walking the value instead of serialising it.
	 *
	 * This used to be `new Blob([JSON.stringify(value)]).size`, which built a full
	 * string and a Blob of the entire conversation on every `set`. Streaming writes
	 * 2-3 cache entries per token, so a 120-message conversation (~200KB) was being
	 * serialised ~100 times a second purely to measure it, producing enough garbage
	 * to keep the collector busy for the whole response.
	 *
	 * Only used to decide eviction, so an estimate within a small factor is fine.
	 */
	private calculateSize(value: V): number {
		return estimateBytes(value, 0);
	}

	private removeNode(node: CacheNode<K, V>): void {
		if (node.prev) {
			node.prev.next = node.next;
		} else {
			this.head = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		} else {
			this.tail = node.prev;
		}
	}

	private addToHead(node: CacheNode<K, V>): void {
		node.prev = null;
		node.next = this.head;

		if (this.head) {
			this.head.prev = node;
		}

		this.head = node;

		if (!this.tail) {
			this.tail = node;
		}
	}

	private evictLRU(): void {
		while (this.tail && this.currentSize > this.capacity) {
			const lastNode = this.tail;
			this.removeNode(lastNode);
			this.cache.delete(lastNode.key);
			this.currentSize -= lastNode.size;
		}
	}

	get(key: K): V | undefined {
		const node = this.cache.get(key);
		if (!node) return undefined;

		this.removeNode(node);
		this.addToHead(node);

		return node.value;
	}

	set(key: K, value: V): void {
		const size = this.calculateSize(value);

		if (size > this.capacity) {
			return;
		}

		const existingNode = this.cache.get(key);

		if (existingNode) {
			existingNode.value = value;
			this.currentSize = this.currentSize - existingNode.size + size;
			existingNode.size = size;
			this.removeNode(existingNode);
			this.addToHead(existingNode);
		} else {
			const newNode: CacheNode<K, V> = {
				key,
				value,
				size,
				prev: null,
				next: null,
			};

			this.currentSize += size;
			this.cache.set(key, newNode);
			this.addToHead(newNode);
		}

		this.evictLRU();
	}

	delete(key: K): boolean {
		const node = this.cache.get(key);
		if (!node) return false;

		this.removeNode(node);
		this.cache.delete(key);
		this.currentSize -= node.size;
		return true;
	}

	clear(): void {
		this.cache.clear();
		this.head = null;
		this.tail = null;
		this.currentSize = 0;
	}

	get size(): number {
		return this.cache.size;
	}

	get bytes(): number {
		return this.currentSize;
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	keys(): IterableIterator<K> {
		return this.cache.keys();
	}
}
