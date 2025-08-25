import { useContext } from 'react';
import './Navbar.css'; // Import the CSS file for styling
import Button from '../Button/Button';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/UserDetailsContext';

const Navbar = () => {
    const { userDetails, setUserDetails } = useContext(UserContext)
    const navigate = useNavigate();
    const LogOutButtonHandler = () => {
        localStorage.removeItem('userLoggedIn');
        setUserDetails({ email: '', token: '' })
        navigate('/login')
    }

    const navigationHandler = (path: string) => {
        navigate(path)
    }

    return (
        <nav className="navbar">
            <ul className="navbar-links">
                <li><a href="#" onClick={() => navigationHandler('/home/products')}>Home</a></li>
                <li><a href="#" onClick={() => navigationHandler('/home/createproduct')}>Create</a></li>
                <li><a href="#gallery">Gallery</a></li>
                <Button lable='Logout' onButtonClick={LogOutButtonHandler} />
            </ul>
        </nav>
    );
};

export default Navbar;