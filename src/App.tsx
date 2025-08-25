import React, { ReactNode, useContext, useEffect, useState, } from 'react';
import './App.css';
import Login from './Pages/login/Login';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, createBrowserRouter, RouterProvider } from 'react-router-dom';
import Products from './Pages/Products/ViewAllProducts/AllProducts';
import CreateProduct from './Pages/Products/Create/CreateProduct';
import { ProductProvider } from './context/ProductContext';
import Home from './Pages/Home/Home';
import ViewProduct from './Pages/Products/ViewProduct/ViewProduct';
import { UserContext, UserDetailsContext } from './context/UserDetailsContext';
import { UserDetails } from './types/User';

interface ProtectedRouteProps {
  children: ReactNode;
  userLoggedIn: boolean; // Add userLoggedIn prop
}

function App() {
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const { userDetails, setUserDetails } = useContext(UserContext)

  useEffect(() => {
    const token = localStorage.getItem('userLoggedIn');
    if (token === 'true') {
      setUserLoggedIn(true)
    } else {
      setUserLoggedIn(false);
    }
  }, [])

  const handleLogin = (values: UserDetails, navigate: (path: string) => void) => {
    setUserDetails({ email: values.email, token: crypto.randomUUID() })
    localStorage.setItem('userLoggedIn', JSON.stringify(true));
    setUserLoggedIn(true)
    navigate('/home/products');
  }

  const router = createBrowserRouter([
    {
      path: '/',
      element: <Navigate to="/login" />
    },
    {
      path: '/login',
      element: <Login userLoggedIn={handleLogin} />
    },
    {
      path: '/home',
      element: <Home />,
      children: [
        {
          path: 'products',
          element: <Products />
        },
        {
          path: 'createproduct',
          element: <CreateProduct />
        },
        {
          path: 'viewproduct/:id',
          element: <ViewProduct />
        },
        {
          path: 'editProduct/:id',
          element: <CreateProduct />
        }
      ]
    },
    {
      path: '*',
      element: <Navigate to="/login" />
    }
  ]);

  return (
    <UserDetailsContext>
      <ProductProvider>
        <RouterProvider router={router} />
      </ProductProvider>
    </UserDetailsContext>
  );
}

export default App;
