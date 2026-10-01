export type ComparisonOperator =
	| "=="
	| "!="
	| "<"
	| "<="
	| ">"
	| ">="
	| "in"
	| "not-in"
	| "array-contains"
	| "array-contains-any";

export type QueryFilter = {
	field: string;
	operator: ComparisonOperator;
	value: unknown;
};

export type CompoundOrderBy = {
	field: string;
	direction: "asc" | "desc";
};

export type CompoundCursorEntry = {
	field: string;
	value: unknown;
	direction: "asc" | "desc";
};

export type ListOptions = {
	filters?: QueryFilter[];
	orderByField?: string;
	orderDirection?: "asc" | "desc";
	limitTo?: number;
	startAfterCursor?: string | Date;
	orderBy?: CompoundOrderBy[];
	startAfterCompoundCursor?: CompoundCursorEntry[];
};
