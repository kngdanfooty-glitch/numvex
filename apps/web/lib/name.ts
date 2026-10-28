/** A username as it is SHOWN: the first letter capital ("bob_builder" -> "Bob_builder"). What is stored and used for sign-in is unchanged. */
export const capitalize = (name: string): string => (name ? name.charAt(0).toUpperCase() + name.slice(1) : name);
