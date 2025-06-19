import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center relative z-10 px-4">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="mb-16 text-center w-full">
          <h1 className="text-7xl font-light bg-gradient-to-r from-teal-300 via-teal-400 to-teal-500 bg-clip-text text-transparent mb-8 tracking-tight">
            xpochat
          </h1>
          <p className="text-2xl text-gray-200 font-light mb-2">
            Join the future
          </p>
          <p className="text-lg text-gray-400 font-light">
            Experience lightning-fast AI conversations
          </p>
        </div>
        <div className="w-full flex justify-center">
          <SignUp 
            fallbackRedirectUrl="/chat"
            appearance={{
              baseTheme: undefined,
              variables: {
                colorPrimary: '#14b8a6',
                colorBackground: 'rgba(15, 15, 15, 0.85)',
                colorInputBackground: 'rgba(20, 20, 20, 0.9)',
                colorInputText: '#f3f4f6',
                colorText: '#f3f4f6',
                colorTextSecondary: '#9ca3af',
                borderRadius: '0.75rem',
                fontFamily: 'inherit',
                fontSize: '0.925rem'
              },
              elements: {
                formButtonPrimary: {
                  background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '500',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  textTransform: 'none',
                  boxShadow: '0 4px 20px rgba(20, 184, 166, 0.25)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                    boxShadow: '0 6px 25px rgba(20, 184, 166, 0.35)',
                    transform: 'translateY(-1px)'
                  },
                  '&:active': {
                    transform: 'translateY(0px)'
                  }
                },
                card: {
                  background: 'rgba(15, 15, 15, 0.85)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(20, 184, 166, 0.15)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(20, 184, 166, 0.05)',
                  borderRadius: '1rem',
                  padding: '2.5rem'
                },
                headerTitle: {
                  color: '#f3f4f6',
                  fontSize: '1.75rem',
                  fontWeight: '300',
                  textAlign: 'center',
                  marginBottom: '0.5rem'
                },
                headerSubtitle: {
                  color: '#9ca3af',
                  fontSize: '0.925rem',
                  textAlign: 'center',
                  fontWeight: '400'
                },
                socialButtonsBlockButton: {
                  background: 'rgba(20, 20, 20, 0.9)',
                  border: '1px solid rgba(75, 85, 99, 0.3)',
                  color: '#f3f4f6',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.925rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: 'rgba(30, 30, 30, 0.9)',
                    borderColor: 'rgba(20, 184, 166, 0.3)',
                    transform: 'translateY(-1px)'
                  }
                },
                formFieldInput: {
                  background: 'rgba(20, 20, 20, 0.9)',
                  border: '1px solid rgba(75, 85, 99, 0.3)',
                  color: '#f3f4f6',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.925rem',
                  transition: 'all 0.2s ease',
                  '&:focus': {
                    borderColor: '#14b8a6',
                    boxShadow: '0 0 0 3px rgba(20, 184, 166, 0.1)',
                    outline: 'none'
                  },
                  '&::placeholder': {
                    color: '#6b7280'
                  }
                },
                formFieldLabel: {
                  color: '#f3f4f6',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  marginBottom: '0.5rem'
                },
                dividerLine: {
                  background: 'rgba(75, 85, 99, 0.3)',
                  height: '1px'
                },
                dividerText: {
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                  fontWeight: '400'
                },
                footerActionLink: {
                  color: '#14b8a6',
                  fontSize: '0.925rem',
                  fontWeight: '500',
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                  '&:hover': {
                    color: '#0d9488',
                    textDecoration: 'underline'
                  }
                },
                footer: {
                  textAlign: 'center',
                  marginTop: '1.5rem'
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
} 