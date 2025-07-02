import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { authClient } from '@/utils/authClient'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

const formSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default function Login() {
    const location = useLocation()
    const searchParams = new URLSearchParams(location.search)
    const redirectUrl = searchParams.get('redirect')
    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    })

    const [loading, setLoading] = useState(false)

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            setLoading(true)
            await authClient.signIn.email({
                email: values.email,
                password: values.password,
                callbackURL: redirectUrl as string || "/"
            })
        } catch (error) {
            if (error instanceof Error) {
                form.setError('password', {
                    type: 'server',
                    message: error.message
                })
            } else {
                form.setError('password', {
                    type: 'server',
                    message: 'An unexpected error occurred'
                })
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen items-center justify-center">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Login</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="email@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="••••••••" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        {form.formState.errors.password?.type === 'server' && (
                                            <FormMessage className="text-red-500">
                                                {form.formState.errors.password.message}
                                            </FormMessage>
                                        )}
                                    </FormItem>
                                )}
                            />
                            <Button disabled={loading} type="submit" className="w-full">
                                {loading && <Loader2Icon className="animate-spin" />}
                                Sign In
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}
