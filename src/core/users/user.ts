export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// PublicUser strips passwordHash — the single sanctioned mapper for user responses.
export type PublicUser = Omit<User, 'passwordHash'>;

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});
