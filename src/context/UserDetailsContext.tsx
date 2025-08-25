import React, { Children, createContext, Dispatch, ReactNode, SetStateAction, useState } from 'react'

interface UserDetails {
  email: string,
  token: string;
}

interface UserContextType {
  userDetails: UserDetails | null;
  setUserDetails: Dispatch<SetStateAction<UserDetails | null>>;
}

const defaultValues: UserContextType = {
  userDetails: null,
  setUserDetails: () => { }
}

interface UserDetailesProviderProps {
  children: ReactNode;
}


export const UserContext = createContext<UserContextType>(defaultValues);

export const UserDetailsContext: React.FC<UserDetailesProviderProps> = ({ children }) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)

  return (
    <UserContext.Provider value={{ userDetails, setUserDetails }}>
      {children}
    </UserContext.Provider>

  )
}