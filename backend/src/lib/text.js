// Human label from an ENUM_VALUE: "CASUAL" -> "Casual", "NEW_CLIENT" -> "New client".
export const title = s => (s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
