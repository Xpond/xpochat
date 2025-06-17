import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center relative z-10 px-4">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="mb-8 text-center w-full">
          <h1 className="text-5xl font-light text-white tracking-wider brand-name mb-4">
            xpochat
          </h1>
          <p className="text-gray-300 text-lg font-light">
            Join the future of AI conversations
          </p>
        </div>
        <div className="w-full flex justify-center">
          <SignUp 
            redirectUrl="/chat"
            appearance={{
              baseTheme: undefined,
              variables: {
                colorPrimary: '#1a4a4a',
                colorBackground: 'rgba(26, 26, 26, 0.8)',
                colorInputBackground: 'rgba(26, 26, 26, 0.8)',
                colorInputText: '#ededed',
                colorText: '#ededed',
                colorTextSecondary: '#a1a1aa',
                borderRadius: '0.5rem',
                fontFamily: 'inherit'
              },
              elements: {
                formButtonPrimary: {
                  background: 'linear-gradient(135deg, #0f2f2f 0%, #1a4a4a 100%)',
                  border: '1px solid rgba(26, 74, 74, 0.3)',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #1a4a4a 0%, #0f2f2f 100%)',
                    boxShadow: '0 4px 15px rgba(26, 74, 74, 0.3)'
                  }
                },
                card: {
                  background: 'rgba(26, 26, 26, 0.8)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(26, 74, 74, 0.3)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  borderRadius: '0.75rem'
                },
                headerTitle: {
                  color: '#ededed',
                  fontSize: '1.5rem',
                  fontWeight: '600'
                },
                headerSubtitle: {
                  color: '#a1a1aa',
                  fontSize: '0.875rem'
                },
                socialButtonsBlockButton: {
                  background: 'rgba(26, 26, 26, 0.8)',
                  border: '1px solid rgba(26, 74, 74, 0.3)',
                  color: '#ededed',
                  backdropFilter: 'blur(10px)',
                  '&:hover': {
                    background: 'rgba(26, 74, 74, 0.2)',
                    borderColor: '#1a4a4a'
                  }
                },
                formFieldInput: {
                  background: 'rgba(26, 26, 26, 0.8)',
                  border: '1px solid rgba(26, 74, 74, 0.3)',
                  color: '#ededed',
                  backdropFilter: 'blur(10px)',
                  '&:focus': {
                    borderColor: '#1a4a4a',
                    boxShadow: '0 0 0 1px #1a4a4a'
                  },
                  '&::placeholder': {
                    color: '#6b7280'
                  }
                },
                formFieldLabel: {
                  color: '#ededed',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                },
                dividerLine: {
                  background: 'rgba(26, 74, 74, 0.3)'
                },
                footerActionLink: {
                  color: '#14b8a6',
                  '&:hover': {
                    color: '#0d9488'
                  }
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
} 