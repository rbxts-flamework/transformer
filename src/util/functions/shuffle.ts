export function shuffle<T>(array: ReadonlyArray<T>): Array<T> {
	return shuffleInPlace([...array]);
}

function shuffleInPlace<T>(array: Array<T>) {
	for (let i = array.length - 1; i >= 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1));
		[array[i], array[randomIndex]] = [array[randomIndex], array[i]];
	}

	return array;
}
