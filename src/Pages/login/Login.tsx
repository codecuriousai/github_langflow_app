import { ErrorMessage, Field, Form, Formik } from 'formik';
import React, { useContext } from 'react'
import * as Yup from 'yup';
import { LoginDetails, UserDetails } from '../../types/User';
import { useNavigate } from 'react-router-dom';
import classes from './Login.module.css'
import { UserContext } from '../../context/UserDetailsContext';

type loginUserProps = { userLoggedIn: (userDetail: UserDetails, navigate: (path: string) => void) => void }

const Login: React.FC<loginUserProps> = ({ userLoggedIn }) => {
     console.log('Login component')
    const { userDetails, setUserDetails } = useContext(UserContext)
    const navigate = useNavigate();

    const validationSchema = Yup.object({
        email: Yup.string().email('Invalid email address').required('Email is required'),
        password: Yup.string().required('Enter password')
    });

    const formSubmit = (values: LoginDetails, { setSubmitting }: any) => {
        if (values.email && values.password) {
            userLoggedIn({ email: values.email, token: crypto.randomUUID() }, navigate);
        } else {
            alert('User Not logged In')
            navigate('/');
        }
    }

    return (
        <div className={classes.login}>
            <h4>Login</h4>
            <Formik initialValues={{ email: '', password: '' }} validationSchema={validationSchema} onSubmit={formSubmit} >
                {({ isSubmitting, errors, touched, values }) => (
                    <Form className={classes.card}>
                        <div className={classes.formGroup}>
                            <label htmlFor="email" className={`${classes.label} ${touched.email && errors.email ? classes.error : ''}`}>Email</label>
                            <Field type="email" name="email" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="email" component="div" />
                        </div>

                        <div className={classes.formGroup}>
                            <label htmlFor="password" className={`label ${touched.password && errors.password ? 'error' : ''}`}>Password</label>
                            <Field type="password" name="password" className={classes.inputField} />
                            <ErrorMessage className={classes.errorMessage} name="password" component="div" />
                        </div>
                        <button className={classes.btn} onClick={() => formSubmit(values, isSubmitting)} > Login</button>
                    </Form>
                )}
            </Formik>
        </div>
    )
}

export default Login;