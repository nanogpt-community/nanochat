export type ValueOf<T> = T[keyof T];

/* God forgive me */
export type Expand<T> = T extends infer O ? O : never;

export type Expect<T extends true> = T;
export type Equal<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

export type FalseIfUndefined<T extends boolean | undefined> = T extends undefined ? false : T;
