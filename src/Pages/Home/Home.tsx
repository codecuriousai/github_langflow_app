import Navbar from '../../Components/Navbar/Navbar'
import { Outlet } from 'react-router-dom';
import classes from './Home.module.css'
import CarouselComponent from '../../Components/carousel/CarouselComponent';

const Home = () => {
  console.log('Home component')
  return (
    <div className={classes.container}>
      <Navbar />
      <CarouselComponent />
      <Outlet />      
    </div>
  )
}

export default Home;