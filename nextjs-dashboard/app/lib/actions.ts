'use server';

import { z } from 'zod'
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Form from '../ui/invoices/create-form';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

//define form schema in zod
const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: 'Please select a customer.'
    }), 
    amount: z.coerce
        .number()
        .gt(0, {message: 'Please enter an amount greater than $0.'}),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: 'Please select an invoice status.'
    }),
    date: z.string(),
})


//create invoice
const CreateInvoice = FormSchema.omit({ id: true, date: true })

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
}

export async function createInvoice(prevState: State, formData: FormData) {
        const validatedFields = CreateInvoice.safeParse({
            customerId: formData.get('customerId'),
            amount: formData.get('amount'),
            status: formData.get('status'),
        })

        console.log(validatedFields)

        if (!validatedFields.success) {
            return {
                errors: validatedFields.error.flatten().fieldErrors,
                message: 'Missing Fields. Failed to create invoice'
            }
        }
        
        //prep data for insertion into db
        const { customerId, amount, status } = validatedFields.data;
        const amountInCents = amount * 100;
        const date = new Date().toISOString().split('T')[0];
    
        try {
            await sql `
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
        } catch (error) {
            return {
                message: 'Database Error: Failed to Create Invoice.',
              };
        }
        

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
    
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true })

//update invoice
export async function updateInvoice(
    id: string,
    prevState: State,
    formData: FormData,
  ) {
    const validatedFields = UpdateInvoice.safeParse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    });
   
    if (!validatedFields.success) {
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to Update Invoice.',
      };
    }
   
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
   
    try {
      await sql`
        UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
        WHERE id = ${id}
      `;
    } catch (error) {
      return { message: 'Database Error: Failed to Update Invoice.' };
    }
   
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
  }

export async function deleteInvoice(id: string) {
    try {
        await sql `DELETE FROM invoices WHERE id = ${id}`;
    } catch (error) {
        console.error('Error deleting invoice: ', error)
    }
    revalidatePath('/dashboard/invoices');
}

//Auth
export async function authenticate(
    prevState: string | undefined, 
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong'
            }
        }
        throw error;
    }
}